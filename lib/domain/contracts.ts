/** New 003–005 contracts. Legacy physical-output RPCs are deliberately excluded. */
export type ProductionMode = "SIMPLE" | "MULTISTEP";
export type RunLifecycle = "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "ABANDONED";
export type RequestState = "OPEN" | "FULFILLED" | "CANCELLED";
/** PostgreSQL numeric quantities should be sent as decimal strings, not computed in JS. */
export type DecimalInput = string;
export type BatchProductionInput = {
  p_version: string;
  p_batches: DecimalInput;
  p_operation_key: string;
};
export type StepCompletionInput = {
  p_run: string;
  p_step: string;
  p_operation_key: string;
};
export type Availability = {
  recipe_version_id: string;
  selected_batch_quantity: number;
  current_batch_stock: number | null;
  prep_threshold: number;
  should_prep: boolean | null;
  production_increment: number;
  /** First ten allowed multiples; not the full domain or an availability guarantee. */
  allowed_batch_sizes: number[];
  max_full_batches: number | null;
  can_complete: boolean;
  can_start: boolean;
  reachable_step: number;
  missing_inputs: {
    item_id: string;
    step_order: number;
    deficit: number | null;
    reason: "INSUFFICIENT" | "UNINITIALIZED";
  }[];
  evaluated_at: string;
};
export type InternalSale = {
  sale_id: string;
  sold_at: string;
  menu_item_id: string;
  quantity: number;
  /** Source metadata, never an authenticated app_users actor. */
  server: string;
};
export type SaleResult = {
  sale_id: string;
  status: "APPLIED" | "REJECTED";
  reason: "UNINITIALIZED" | "INSUFFICIENT_STOCK" | null;
};
