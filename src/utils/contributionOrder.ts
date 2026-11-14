import type { AutomationContribution, AutomationContributionGroup } from "../types";

export function findContribution(groups: AutomationContributionGroup[], contributionId: string): { groupId: string; index: number } | null {
  for (const group of groups) {
    const index = group.contributions.findIndex((contribution) => contribution.id === contributionId);
    if (index >= 0) return { groupId: group.id, index };
  }
  return null;
}

/** Array order is execution order, so these helpers only reorder; contribution objects are reused as-is. */
export function moveContributionWithinGroup(
  groups: AutomationContributionGroup[],
  groupId: string,
  contributionId: string,
  toIndex: number,
): AutomationContributionGroup[] {
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    const fromIndex = group.contributions.findIndex((contribution) => contribution.id === contributionId);
    if (fromIndex < 0 || toIndex < 0 || toIndex >= group.contributions.length || fromIndex === toIndex) return group;
    const contributions = [...group.contributions];
    const [moved] = contributions.splice(fromIndex, 1);
    contributions.splice(toIndex, 0, moved);
    return { ...group, contributions };
  });
}

export function insertContributionAfter(
  groups: AutomationContributionGroup[],
  groupId: string,
  afterContributionId: string,
  contribution: AutomationContribution,
): AutomationContributionGroup[] {
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    const afterIndex = group.contributions.findIndex((existing) => existing.id === afterContributionId);
    const contributions = [...group.contributions];
    contributions.splice(afterIndex < 0 ? contributions.length : afterIndex + 1, 0, contribution);
    return { ...group, contributions };
  });
}

/** Moves a contribution into another (or the same) group at `toIndex`, clamped to the target's bounds. */
export function moveContributionToGroup(
  groups: AutomationContributionGroup[],
  contributionId: string,
  targetGroupId: string,
  toIndex: number,
): AutomationContributionGroup[] {
  const from = findContribution(groups, contributionId);
  if (!from || !groups.some((group) => group.id === targetGroupId)) return groups;
  if (from.groupId === targetGroupId) return moveContributionWithinGroup(groups, targetGroupId, contributionId, toIndex);
  const moved = groups.find((group) => group.id === from.groupId)!.contributions[from.index];
  return groups.map((group) => {
    if (group.id === from.groupId) {
      return { ...group, contributions: group.contributions.filter((contribution) => contribution.id !== contributionId) };
    }
    if (group.id === targetGroupId) {
      const contributions = [...group.contributions];
      contributions.splice(Math.max(0, Math.min(toIndex, contributions.length)), 0, moved);
      return { ...group, contributions };
    }
    return group;
  });
}

export function moveGroup(groups: AutomationContributionGroup[], groupId: string, toIndex: number): AutomationContributionGroup[] {
  const fromIndex = groups.findIndex((group) => group.id === groupId);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= groups.length || fromIndex === toIndex) return groups;
  const next = [...groups];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
