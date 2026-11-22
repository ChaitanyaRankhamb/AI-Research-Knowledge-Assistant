/**
 * Value object representing a ResearchPlanVersion identifier.
 */
export class ResearchPlanVersionId {
  constructor(private readonly value: string) {}

  public toString(): string {
    return this.value;
  }

  public equals(other: ResearchPlanVersionId): boolean {
    return this.value === other.toString();
  }
}
