// Reference V2.2 safety guard.
//
// Generative mutation of THE REV. content photographs is intentionally disabled.
// The supplied content reference must remain authentic; use render-blog-image.mjs,
// which performs deterministic crop/resize + editorial framing only.

throw new Error(
  'Reference V2.2 source-photo lock: generative image editing is disabled. ' +
  'Use scripts/render-blog-image.mjs with an existing THE REV. content_reference.'
);
