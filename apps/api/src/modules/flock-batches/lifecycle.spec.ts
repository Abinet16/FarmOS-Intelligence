import { BATCH_STATUSES, canTransition, isEnded } from '@farmos/shared-types';

describe('flock batch lifecycle', () => {
  it('only moves forward', () => {
    const allowed = BATCH_STATUSES.flatMap((from) =>
      BATCH_STATUSES.filter((to) => canTransition(from, to)).map((to) => `${from}→${to}`),
    );
    expect(allowed).toEqual([
      'PLANNED→ACTIVE',
      'PLANNED→CLOSED',
      'ACTIVE→DEPLETED',
      'DEPLETED→CLOSED',
    ]);
  });

  it('treats depleted and closed batches as ended', () => {
    expect(BATCH_STATUSES.filter(isEnded)).toEqual(['DEPLETED', 'CLOSED']);
  });
});
