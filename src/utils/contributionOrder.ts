import type { AutomationContribution, AutomationContributionGroup } from "../types";

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
