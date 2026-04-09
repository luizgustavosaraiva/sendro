export type AcquisitionResponse = {
  flow: "acquisition";
  reply: string;
};

const DELIVERY_INTENT_RE = /(entrega|entregar|delivery|courier|motoboy|frete)/i;

export function buildUnknownContactAcquisitionResponse(messageText: string): AcquisitionResponse {
  if (DELIVERY_INTENT_RE.test(messageText)) {
    return {
      flow: "acquisition",
      reply:
        "Olá! A Sendro ajuda operações de entrega sob demanda. Se quiser, eu posso te apresentar a plataforma e entender rapidamente seu tipo de operação."
    };
  }

  return {
    flow: "acquisition",
    reply:
      "Olá! A Sendro opera entregas para clientes cadastrados. Posso te apresentar a plataforma e te encaminhar para o próximo passo."
  };
}
