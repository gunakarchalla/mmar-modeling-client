/** djb2 hash → deterministic HSL colour per user UUID (stable across all clients). */
export function userColor(uuid: string): string {
    let hash = 5381;
    for (let i = 0; i < uuid.length; i++) {
        hash = (((hash << 5) + hash) ^ uuid.charCodeAt(i)) >>> 0;
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 55%)`;
}

/** Up to 2-character initials from a display name. */
export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
