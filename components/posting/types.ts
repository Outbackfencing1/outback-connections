// Shared types for the posting forms.
export type Category = {
  id: string;
  slug: string;
  label: string;
};

export type FormState = {
  errors: Record<string, string>;
  values: Record<string, string>;
};
