export const compareIds = (
    item: { id: string | number },
    record: { id: string | number },
) => {
    if (typeof item.id === 'string' && typeof record.id === 'number') {
        return item.id !== record.id.toString()
    }
    if (typeof item.id === 'number' && typeof record.id === 'string') {
        return item.id !== Number(record.id)
    }
    return item.id !== record.id
}
