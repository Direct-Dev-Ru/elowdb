export function safeCast<T>(
    value: unknown,
    typeGuard: (value: unknown) => value is T,
): T | null {
    return typeGuard(value) ? value : null
}

// example

interface User {
    id: number
    name: string
}

export function isUser(obj: unknown): obj is User {
    return (
        typeof obj === 'object' && obj !== null && 'id' in obj && 'name' in obj
    )
}
export function processUser(aUser: unknown): User | null {
    const theUser = safeCast(aUser, isUser)
    if (theUser) {
        return theUser
    }
    return null
}
