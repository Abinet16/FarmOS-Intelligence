import { Suspense } from 'react';
import { ReportsView } from './reports-view';

// Data loads on the client with the user's session; there is no static shell.
export const instant = false;

export default function Page() {
  // useSearchParams (the ?job= highlight) needs a Suspense boundary.
  return (
    <Suspense>
      <ReportsView />
    </Suspense>
  );
}
