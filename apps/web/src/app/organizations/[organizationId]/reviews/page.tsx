import { ReviewsView } from './reviews-view';

// Data loads on the client with the user's session; there is no static shell.
export const instant = false;

export default function Page() {
  return <ReviewsView />;
}
