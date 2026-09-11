import { Component } from "react";

/**
 * Mostra o erro na tela em vez de deixar a página em branco.
 * Sem isso, qualquer exceção durante a renderização some e só aparece no console.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error("[App] Erro não tratado:", erro, info);
  }

  render() {
    if (!this.state.erro) return this.props.children;

    return (
      <div className="container" style={{ maxWidth: 720 }}>
        <h1>Algo quebrou ao carregar o painel</h1>
        <p className="subtitle">
          A mensagem abaixo é o erro real. O console do navegador (F12) tem o rastreamento
          completo.
        </p>
        <pre
          style={{
            background: "var(--card-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 16,
            overflow: "auto",
            fontSize: "0.85rem",
            whiteSpace: "pre-wrap"
          }}
        >
          {String(this.state.erro?.stack || this.state.erro?.message || this.state.erro)}
        </pre>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </div>
    );
  }
}
