/**
 * Value object representing a ResearchMessage identifier.
 */
export class ResearchMessageId {
  constructor(private readonly value: string) {}

  public toString(): string {
    return this.value;
  }

  public equals(other: ResearchMessageId): boolean {
    return this.value === other.toString();
  }
}
