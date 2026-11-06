export function ErrorMessage({ error }: { error: Error | null | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {error.message}
    </p>
  );
}
