// Округляем n до ближайшей степени двойки
export const nextPowerOf2 = (n: number): number => {
    return 2 ** Math.ceil(Math.log2(n))
}
