import { JSONPath } from "jsonpath-plus";

export function query(json: any, path: string): any[] {
    return JSONPath({ json, path, wrap: true }) as any[];
}

export function paths(json: any, path: string): Array<Array<string | number>> {
    const matches = JSONPath({ json, path, resultType: "path", wrap: true }) as string[];

    return matches.map(match => {
        let current = json;

        return JSONPath.toPathArray(match).map((part, index) => {
            if (index === 0) {
                return part;
            }

            const typedPart = Array.isArray(current) ? Number(part) : part;
            current = current?.[typedPart];
            return typedPart;
        });
    });
}
