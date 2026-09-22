import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Called only with connections to the disposable Unix-socket cluster.
export async function testConcurrency(admin, connect, fixtureSql) {
  const setup = fixtureSql.slice(0, fixtureSql.indexOf('-- Table grants and RPC access'));
  assert.ok(setup.includes('Synthetic Auth rows'), 'expected fixture setup');
  await admin.query(setup);
  await admin.query('COMMIT');
  const a = await connect();
  const b = await connect();
  const manager = '10000000-0000-0000-0000-000000000001';
  const bar1 = '10000000-0000-0000-0000-000000000002';
  const bar2 = '10000000-0000-0000-0000-000000000003';
  const version = '30000000-0000-0000-0000-000000000001';
  const pidB = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
  const begin = async (c, identity) => {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE authenticated');
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [identity]);
  };
  const scalar = async (c, sql, args) => Object.values((await c.query(sql, args)).rows[0])[0];
  const blocked = async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const row = (await admin.query('select cardinality(pg_blocking_pids($1)) > 0 as blocked', [pidB])).rows[0];
      if (row.blocked) return;
      await delay(20);
    }
    assert.fail('The competing session did not demonstrably wait on a database lock.');
  };
  // Attach error handlers immediately so an expected database denial never
  // becomes an unhandled rejection while the other transaction is committing.
  const outcome = (p) => p.then(value => ({ value }), error => ({ error }));
  try {
    await begin(a, manager);
    await a.query('select public.approve_recipe_version($1)', [version]);
    await a.query('COMMIT');

    const requestKey = randomUUID();
    const requestSql = 'select public.create_batch_request($1,2,\'batch\',$2)';
    await begin(a, manager);
    const request = await scalar(a, requestSql, [version, requestKey]);
    await begin(b, manager);
    const requestRetry = outcome(scalar(b, requestSql, [version, requestKey]));
    await blocked();
    await a.query('COMMIT');
    assert.deepEqual(await requestRetry, { value: request });
    await b.query('COMMIT');
    assert.equal(await scalar(admin, 'select count(*)::int from public.batch_requests'), 1);
    console.log('Concurrency PASS: duplicate request key waits and returns one request.');

    const runSql = 'select public.start_batch_run($1,1,\'batch\',$2,$3)';
    const runKey = randomUUID();
    await begin(a, bar1);
    const run = await scalar(a, runSql, [version, runKey, request]);
    await begin(b, bar1);
    const runRetry = outcome(scalar(b, runSql, [version, runKey, request]));
    await blocked();
    await a.query('COMMIT');
    assert.deepEqual(await runRetry, { value: run });
    await b.query('COMMIT');
    assert.equal(await scalar(admin, 'select count(*)::int from public.batch_runs'), 1);
    console.log('Concurrency PASS: duplicate run key waits and returns one run.');

    await begin(a, bar1);
    await scalar(a, runSql, [version, randomUUID(), request]);
    await begin(b, bar2);
    const overbook = outcome(scalar(b, runSql, [version, randomUUID(), request]));
    await blocked();
    await a.query('COMMIT');
    assert.equal((await overbook).error?.code, '23514');
    await b.query('ROLLBACK');
    assert.equal(await scalar(admin, 'select sum(expected_output_qty)::int from public.batch_runs where request_id=$1', [request]), 6);
    console.log('Concurrency PASS: competing reservations cannot exceed the requested output.');

    const steps = (await admin.query('select s.id from public.batch_run_steps s join public.recipe_steps d on d.id=s.recipe_step_id where s.batch_run_id=$1 order by d.step_order', [run])).rows;
    await begin(a, bar1);
    await a.query("select public.set_batch_step($1,$2,'DONE')", [run, steps[0].id]);
    await begin(b, bar2);
    const blockStep = outcome(b.query("select public.set_batch_step($1,$2,'BLOCKED','Synthetic concurrency blocker')", [run, steps[1].id]));
    await blocked();
    await a.query('COMMIT');
    assert.equal((await blockStep).error, undefined);
    await b.query('COMMIT');
    assert.equal(await scalar(admin, 'select status from public.batch_runs where id=$1', [run]), 'BLOCKED');
    assert.equal(await scalar(admin, 'select status from public.batch_run_steps where id=$1', [steps[0].id]), 'DONE');
    console.log('Concurrency PASS: simultaneous step changes serialize and preserve completed work.');

    await begin(a, bar1);
    await a.query("select public.set_batch_step($1,$2,'PENDING')", [run, steps[1].id]);
    await b.query('BEGIN');
    const deactivate = outcome(b.query('update public.app_users set active=false where auth_user_id=$1', [bar1]));
    await blocked();
    await a.query('COMMIT');
    assert.equal((await deactivate).error, undefined);
    await b.query('COMMIT');
    await begin(a, bar1);
    const denied = await outcome(a.query("select public.set_batch_step($1,$2,'DONE')", [run, steps[1].id]));
    assert.equal(denied.error?.code, '42501');
    await a.query('ROLLBACK');
    console.log('Concurrency PASS: deactivation waits for an in-flight write, then denies the next write.');
  } finally {
    await Promise.allSettled([a.query('ROLLBACK'), b.query('ROLLBACK')]);
    await Promise.allSettled([a.end(), b.end()]);
  }
}
