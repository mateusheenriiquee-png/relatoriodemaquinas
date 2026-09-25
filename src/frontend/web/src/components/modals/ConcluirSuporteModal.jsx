import { useEffect, useState } from "react";
import Modal from "../Modal";
import { VALIDADES_ESTENDIDAS, parseValor, validarFinalizacao } from "../../utils/finalizacao";

/**
 * Dados pedidos ao técnico no momento de finalizar o suporte.
 *
 * Substituiu a pergunta "venda ganha / perdida": esses campos alimentam os
 * relatórios do certificado emitido (tipo, validade, valor, vencimento).
 *
 * "Sistema" já vem preenchido com o AC do chamado, quando houver — é quase
 * sempre a mesma informação, e o técnico só corrige se for diferente.
 */
function formularioInicial(item) {
  const ac = String(item?.ac || "").trim();
  return {
    emailCliente: item?.emailCliente || "",
    comprouOutroProduto: typeof item?.comprouOutroProduto === "boolean" ? item.comprouOutroProduto : null,
    protocoloCertificado: item?.protocoloCertificado || "",
    dataEmissao: item?.dataEmissao || "",
    dataVencimento: item?.dataVencimento || "",
    tipoCertificado: item?.tipoCertificado || "",
    valor: item?.valorVenda ? String(item.valorVenda).replace(".", ",") : "",
    validadeEstendida: item?.validadeEstendida || "",
    sistema: item?.sistema || (ac && ac !== "Não informado" ? ac : "")
  };
}

export default function ConcluirSuporteModal({ open, item, onClose, onConfirm }) {
  const [form, setForm] = useState(() => formularioInicial(item));
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(formularioInicial(item));
      setErros({});
      setSalvando(false);
    }
  }, [open, item]);

  function alterar(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setErros((atual) => (atual[campo] ? { ...atual, [campo]: undefined } : atual));
  }

  async function confirmar(e) {
    e?.preventDefault();
    const encontrados = validarFinalizacao(form);
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;

    setSalvando(true);
    try {
      await onConfirm({
        emailCliente: form.emailCliente.trim(),
        comprouOutroProduto: form.comprouOutroProduto,
        protocoloCertificado: form.protocoloCertificado.trim(),
        dataEmissao: form.dataEmissao,
        dataVencimento: form.dataVencimento,
        tipoCertificado: form.tipoCertificado.trim(),
        valorVenda: parseValor(form.valor),
        validadeEstendida: form.validadeEstendida,
        sistema: form.sistema.trim()
      });
    } finally {
      setSalvando(false);
    }
  }

  const campo = (nome, rotulo, input, span2 = false) => (
    <div className={`field${span2 ? " field-span-2" : ""}${erros[nome] ? " field-erro" : ""}`}>
      <label htmlFor={`fin-${nome}`}>{rotulo}</label>
      {input}
      {erros[nome] ? <small className="field-erro-texto">{erros[nome]}</small> : null}
    </div>
  );

  const texto = (nome, props = {}) => (
    <input
      id={`fin-${nome}`}
      value={form[nome]}
      aria-invalid={erros[nome] ? true : undefined}
      onChange={(e) => alterar(nome, e.target.value)}
      disabled={salvando}
      {...props}
    />
  );

  return (
    <Modal
      open={open}
      onClose={salvando ? undefined : onClose}
      title="Finalizar suporte"
      variant="wide"
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" form="form-finalizar" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Finalizando..." : "Finalizar suporte"}
          </button>
        </>
      }
    >
      <form id="form-finalizar" className="form-grid" onSubmit={confirmar} noValidate>
        {campo("emailCliente", "Email", texto("emailCliente", { type: "email", placeholder: "cliente@exemplo.com", autoFocus: true }), true)}

        <div className={`field field-span-2${erros.comprouOutroProduto ? " field-erro" : ""}`}>
          <span className="field-rotulo" id="fin-comprou-rotulo">
            Comprou outro produto?
          </span>
          <div className="opcoes-sim-nao" role="radiogroup" aria-labelledby="fin-comprou-rotulo">
            {[
              [true, "Sim"],
              [false, "Não"]
            ].map(([valor, rotulo]) => (
              <button
                key={rotulo}
                type="button"
                role="radio"
                aria-checked={form.comprouOutroProduto === valor}
                className={`btn ${form.comprouOutroProduto === valor ? "btn-primary" : "btn-ghost"}`}
                onClick={() => alterar("comprouOutroProduto", valor)}
                disabled={salvando}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {erros.comprouOutroProduto ? <small className="field-erro-texto">{erros.comprouOutroProduto}</small> : null}
        </div>

        {campo("protocoloCertificado", "Protocolo do certificado", texto("protocoloCertificado", { maxLength: 80 }))}
        {campo("tipoCertificado", "Tipo de certificado", texto("tipoCertificado", { maxLength: 80, placeholder: "Ex.: e-CPF A1" }))}
        {campo("dataEmissao", "Data de emissão", texto("dataEmissao", { type: "date" }))}
        {campo("dataVencimento", "Data de vencimento", texto("dataVencimento", { type: "date" }))}
        {campo("valor", "Valor (R$)", texto("valor", { inputMode: "decimal", placeholder: "0,00" }))}
        {campo(
          "validadeEstendida",
          "Validade estendida",
          <select
            id="fin-validadeEstendida"
            value={form.validadeEstendida}
            aria-invalid={erros.validadeEstendida ? true : undefined}
            onChange={(e) => alterar("validadeEstendida", e.target.value)}
            disabled={salvando}
          >
            <option value="">Selecione</option>
            {VALIDADES_ESTENDIDAS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}
        {campo("sistema", "Sistema", texto("sistema", { maxLength: 80 }), true)}
      </form>
    </Modal>
  );
}
