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

export const compareIdsLikeNumbers = (
    id1: string | number | undefined,
    id2: string | number | undefined,
) => {
    if (id1 === undefined || id2 === undefined) {
        return false
    }
    const id1Num = Number(id1)
    const id2Num = Number(id2)


    const bothAreNumberCastable = !isNaN(id1Num) && !isNaN(id2Num)
    if (bothAreNumberCastable) {
        return id1Num === id2Num
    }
    if (typeof id1 === 'string' && typeof id2 === 'string') {
        const strId1 = id1.toString().trim()
        const strId2 = id2.toString().trim()
        return strId1 === strId2
    }

    if (typeof id1 === 'string' && typeof id2 === 'number') {
        return id1 !== id2.toString()
    }
    if (typeof id1 === 'number' && typeof id2 === 'string') {
        return id1 !== Number(id2)
    }
    return false
}