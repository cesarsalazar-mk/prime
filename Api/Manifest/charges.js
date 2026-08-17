const IVA_RATE = 0.12
const FREIGHT_PER_LB = 25
const CUSTOMS_FEE = 30

function round2(value) {
  return Number((Number(value) || 0).toFixed(2))
}

function calculateCharges({ costoProducto, tasa, weight }) {
  const cif = Number(costoProducto) || 0
  const rate = Number(tasa) || 0
  const packageWeight = Number(weight) || 0

  const dai = cif * rate
  const totalIva = (cif + dai) * IVA_RATE
  const importe = dai + totalIva
  const totalAPagar = importe + FREIGHT_PER_LB * packageWeight + CUSTOMS_FEE

  return {
    dai: round2(dai),
    total_iva: round2(totalIva),
    cif: round2(totalIva),
    importe: round2(importe),
    total_a_pagar: round2(totalAPagar),
  }
}

module.exports = {
  calculateCharges,
  round2,
}
