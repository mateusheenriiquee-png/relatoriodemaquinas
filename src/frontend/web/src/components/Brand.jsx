/**
 * Identidade do painel: logo da Certify (public/logo-certify.jpg) + nome.
 */
export default function Brand({ subtitulo = "Painel operacional", markOnly = false }) {
  const mark = <img className="brand-mark" src="/logo-certify.jpg" alt="" aria-hidden="true" />;

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
