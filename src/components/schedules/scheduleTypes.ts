export type ScheduleRecord = {
  id: string;
  flowId: string;
  cronKind: string;
  enabled: boolean;
  nextRunAt: string;
  label: string;
  flow?: { id: string; name: string };
};
