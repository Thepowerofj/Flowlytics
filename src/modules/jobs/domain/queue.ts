export function estimateEtaSeconds(queuePosition: number, avgSecondsPerJob = 20): number {
  return Math.max(5, queuePosition * avgSecondsPerJob);
}

export function fairPriority(isPaid: boolean): number {
  // Lower number = higher priority; paid users get a mild boost but still fair FIFO within band
  return isPaid ? 50 : 100;
}
