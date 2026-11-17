export function getUnknownFields(expectedFields: string[], body: Record<string, unknown>): string[] {
    return Object.keys(body).filter(key => !expectedFields.includes(key));
}