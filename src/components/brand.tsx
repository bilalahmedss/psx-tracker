/** Placeholder brand until the product is named. */
export const APP_NAME = "PSX Tracker";

export function BrandMark() {
  return (
    <>
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
      >
        PT
      </span>
      <span>{APP_NAME}</span>
    </>
  );
}
