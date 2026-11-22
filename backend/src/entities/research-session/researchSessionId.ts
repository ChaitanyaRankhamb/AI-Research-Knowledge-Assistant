/**
 * Value object representing a ResearchSession identifier.
 * Provides type-safety and consistency across the domain layer.
 */
export class ResearchSessionId {
  constructor(private readonly value: string) {}

  public toString(): string {
    return this.value;
  }

  public equals(other: ResearchSessionId): boolean {
    return this.value === other.toString();
  }
}
