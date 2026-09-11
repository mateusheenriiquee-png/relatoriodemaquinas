/**
 * Identidade do painel: monograma em CSS + nome.
 * Substituiu o antigo logo.png — nenhum arquivo de imagem é usado.
 */
export default function Brand({ subtitulo = "Painel operacional", markOnly = false }) {
  const mark = (
    <div className="brand-mark" aria-hidden="true">
      ST
    </div>
  );

  if (markOnly) return mark;

  return (
    <div className="brand">
      {mark}
      <div className="brand-text">
        <h1>Suporte Técnico</h1>
        <span>{subtitulo}</span>
      </div>
    </div>
  );
}
