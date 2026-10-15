import { useEffect, useRef, useState } from "react";
import Modal from "../Modal";
import { formatCpfCnpj } from "../../utils/format";
import {
  VALIDADES_ESTENDIDAS,
  casarOpcao,
  mesclarPrefill,
  parseValor,
  rotuloFonte,
  situacaoParaIA,
  validarFinalizacao
} from "../../utils/finalizacao";
import { carregarOpcoesFinalizacao, carregarPrefill, carregarPrefillIA } from "../../services/suportesService";
import { sistemaDoProtocolo } from "../../../../../shared/prefill-finalizacao.mjs";

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
    // A automação do chat grava o protocolo no campo geral do chamado
    // (item.protocolo); é o mesmo número do certificado.
    protocoloCertificado: item?.protocoloCertificado || item?.protocolo || "",
    // Já vem preenchido quando a automação do Kommo achou o CPF/CNPJ no lead
    // ou na conversa — o campo geral do chamado (item.cpfCnpj), não um novo.
    cpfCnpj: item?.cpfCnpj || "",
    // CPF da pessoa (desde 08/10). Num PF o Doc. Cliente já é o CPF.
    cpf: item?.cpf || (String(item?.cpfCnpj || "").replace(/\D/g, "").length === 11 ? item.cpfCnpj : ""),
    dataEmissao: item?.dataEmissao || "",
    dataVencimento: item?.dataVencimento || "",
    tipoCertificado: item?.tipoCertificado || "",
    valor: item?.valorVenda ? String(item.valorVenda).replace(".", ",") : "",
    valorVE: typeof item?.valorVE === "number" ? String(item.valorVE).replace(".", ",") : "",
    validadeEstendida: item?.validadeEstendida || "",
    sistema: item?.sistema || (ac && ac !== "Não informado" ? ac : "")
  };
}

export default function ConcluirSuporteModal({ open, item, onClose, onConfirm, getIdToken }) {
  const [form, setForm] = useState(() => formularioInicial(item));
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  // Opções das listas do Kommo ({ sistema, validade_estendida, tipo_certificado }).
  // Vazio enquanto carrega ou se o Kommo não responder: Sistema e Tipo viram
  // texto livre e a validade usa a lista padrão.
  const [opcoes, setOpcoes] = useState({});
  // De onde veio cada campo preenchido automaticamente ("Kommo", "foto"...).
  const [fontes, setFontes] = useState({});
  // A IA (fotos, PDFs, texto livre) leva alguns segundos: aviso discreto.
  const [buscandoIA, setBuscandoIA] = useState(false);
  // Campos em que o técnico já mexeu: nada que chega depois sobrescreve.
  const editados = useRef(new Set());
  // Cópia sempre atual do formulário, para mesclar sugestões que chegam depois
  // sem depender de um setState dentro de outro.
  const formAtual = useRef(form);
  formAtual.current = form;

  useEffect(() => {
    if (open) {
      setForm(formularioInicial(item));
      setErros({});
      setSalvando(false);
      setFontes({});
      setBuscandoIA(false);
      editados.current = new Set();
    }
  }, [open, item]);

  /*
   * Ao abrir: opções das listas + sugestões rápidas (Kommo e texto da
   * conversa) juntas; depois, em segundo plano, a IA com fotos e PDFs. Cada
   * camada só preenche o que ainda está vazio e não foi editado.
   */
  useEffect(() => {
    if (!open || !getIdToken) return undefined;
    let ativo = true;

    const aplicar = (campos, listas) => {
      const { form: novo, fontes: novas } = mesclarPrefill(formAtual.current, campos, {
        editados: editados.current,
        opcoes: listas
      });
      if (!Object.keys(novas).length) return;
      formAtual.current = novo;
      setForm(novo);
      setFontes((anteriores) => ({ ...anteriores, ...novas }));
      // Campo preenchido agora não pode continuar com o erro de antes.
      setErros((atuais) => {
        const copia = { ...atuais };
        for (const chave of Object.keys(novas)) delete copia[chave];
        return copia;
      });
    };

    (async () => {
      const [recebidas, rapidos] = await Promise.all([
        carregarOpcoesFinalizacao({ getIdToken }),
        carregarPrefill(item, { getIdToken })
      ]);
      if (!ativo) return;
      setOpcoes(recebidas);
      // Ajusta o que veio do chamado para a grafia exata da opção do Kommo.
      const ajustado = {
        ...formAtual.current,
        tipoCertificado: casarOpcao(formAtual.current.tipoCertificado, recebidas.tipo_certificado),
        sistema: casarOpcao(formAtual.current.sistema, recebidas.sistema),
        validadeEstendida: casarOpcao(formAtual.current.validadeEstendida, recebidas.validade_estendida)
      };
      formAtual.current = ajustado;
      setForm(ajustado);
      aplicar(rapidos, recebidas);
      // O protocolo pode ter vindo só do chamado (o Worker não o viu): o
      // formato dele ainda diz o sistema (102-…/10 dígitos = Consulti).
      const deduzido = sistemaDoProtocolo(formAtual.current.protocoloCertificado);
      if (deduzido) aplicar({ sistema: { valor: deduzido, fonte: "dedução", sugerido: true } }, recebidas);

      // Kommo e conversa primeiro; a IA (fotos e PDFs) só se ainda faltar
      // algo — e só procura o que falta.
      const { jaPreenchidos, vale } = situacaoParaIA(formAtual.current);
      if (!item?.kommoLeadId || !vale) return;
      setBuscandoIA(true);
      const daIA = await carregarPrefillIA(item, jaPreenchidos, { getIdToken });
      if (!ativo) return;
      setBuscandoIA(false);
      aplicar(daIA, recebidas);
    })();

    return () => {
      ativo = false;
    };
  }, [open, item, getIdToken]);

  const validades = opcoes.validade_estendida?.length ? opcoes.validade_estendida : VALIDADES_ESTENDIDAS;

  function alterar(campo, valor) {
    editados.current.add(campo);
    // Mexeu no campo: a etiqueta de origem deixa de valer.
    setFontes((atual) => {
      if (!atual[campo]) return atual;
      const copia = { ...atual };
      delete copia[campo];
      return copia;
    });
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setErros((atual) => (atual[campo] ? { ...atual, [campo]: undefined } : atual));
  }

  async function confirmar(e) {
    e?.preventDefault();
    const encontrados = validarFinalizacao(form, { validades });
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;

    setSalvando(true);
    try {
      await onConfirm({
        emailCliente: form.emailCliente.trim(),
        comprouOutroProduto: form.comprouOutroProduto,
        protocoloCertificado: form.protocoloCertificado.trim(),
        cpfCnpj: formatCpfCnpj(form.cpfCnpj.trim()),
        cpf: formatCpfCnpj(form.cpf.trim()),
        dataEmissao: form.dataEmissao,
        dataVencimento: form.dataVencimento,
        tipoCertificado: form.tipoCertificado.trim(),
        // Tudo opcional: valor em branco grava 0 (sem venda informada).
        valorVenda: form.valor.trim() ? parseValor(form.valor) : 0,
        valorVE: form.valorVE.trim() ? parseValor(form.valorVE) : null,
        validadeEstendida: form.validadeEstendida,
        sistema: form.sistema.trim()
      });
    } finally {
      setSalvando(false);
    }
  }

  const campo = (nome, rotulo, input, span2 = false) => (
    <div className={`field${span2 ? " field-span-2" : ""}${erros[nome] ? " field-erro" : ""}`}>
      <label htmlFor={`fin-${nome}`}>
        {rotulo}
        {etiqueta(nome)}
      </label>
      {input}
      {erros[nome] ? <small className="field-erro-texto">{erros[nome]}</small> : null}
    </div>
  );

  /** "Kommo", "conversa", "foto · confira"... ao lado do rótulo. */
  const etiqueta = (nome) =>
    fontes[nome] ? (
      <span className={`fonte-dado${fontes[nome].sugerido ? " fonte-dado-sugerido" : ""}`}>
        {rotuloFonte(fontes[nome])}
      </span>
    ) : null;

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

  /** <select> com as opções do Kommo quando houver; senão, texto livre. */
  const lista = (nome, opcoesDoCampo, propsTexto = {}) =>
    opcoesDoCampo?.length ? (
      <select
        id={`fin-${nome}`}
        value={form[nome]}
        aria-invalid={erros[nome] ? true : undefined}
        onChange={(e) => alterar(nome, e.target.value)}
        disabled={salvando}
      >
        <option value="">Selecione</option>
        {opcoesDoCampo.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    ) : (
      texto(nome, propsTexto)
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
        {buscandoIA ? (
          <p className="field-span-2 prefill-aviso" role="status">
            Buscando dados na conversa, fotos e PDFs… pode ir preenchendo.
          </p>
        ) : null}
        {campo("emailCliente", "Email", texto("emailCliente", { type: "email", placeholder: "cliente@exemplo.com", autoFocus: true }), true)}

        <div className={`field field-span-2${erros.comprouOutroProduto ? " field-erro" : ""}`}>
          <span className="field-rotulo" id="fin-comprou-rotulo">
            Comprou outro produto?
            {etiqueta("comprouOutroProduto")}
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
        {campo("cpfCnpj", "Doc. Cliente (CPF/CNPJ)", texto("cpfCnpj", { maxLength: 32, placeholder: "CPF ou CNPJ do certificado" }))}
        {campo("cpf", "CPF", texto("cpf", { maxLength: 14, inputMode: "numeric", placeholder: "000.000.000-00" }))}
        {/* Ao lado do CPF (meia largura): com a largura inteira, o CPF ficava
            sozinho numa linha com um vão à direita. */}
        {campo(
          "tipoCertificado",
          "Tipo de certificado",
          lista("tipoCertificado", opcoes.tipo_certificado, { maxLength: 80, placeholder: "Ex.: PF A1" })
        )}
        {campo("dataEmissao", "Data de emissão", texto("dataEmissao", { type: "date" }))}
        {campo("dataVencimento", "Data de vencimento", texto("dataVencimento", { type: "date" }))}
        {campo("valor", "Valor (R$)", texto("valor", { inputMode: "decimal", placeholder: "0,00" }))}
        {campo("valorVE", "Valor V.E (R$)", texto("valorVE", { inputMode: "decimal", placeholder: "0,00" }))}
        {campo("validadeEstendida", "Validade estendida", lista("validadeEstendida", validades))}
        {campo("sistema", "Sistema", lista("sistema", opcoes.sistema, { maxLength: 80 }))}
      </form>
    </Modal>
  );
}
