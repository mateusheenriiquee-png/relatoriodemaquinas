/**
 * Lista de contagens com barra proporcional.
 *
 * É uma tabela, não um gráfico: com 5 categorias fixas e nomes longos, a barra
 * horizontal ao lado do rótulo se lê mais rápido do que um donut com legenda —
 * e o número exato continua visível, que é o que se copia para o relatório.
 *
 * `subItens` recebe o detalhamento de uma linha (as plataformas de um uso),
 * mostrado recuado sob ela.
 */
/**
 * `cores` (opcional) mapeia rótulo → cor da barra. Usado em "Por situação" para
 * cada status sair com a mesma cor da pílula da lista e do gráfico de status —
 * sem isso todas as barras saíam laranja e o olho perdia a associação.
 */
export default function BreakdownList({ itens, subItens = {}, aoClicar, cores = {} }) {
  const maximo = Math.max(1, ...itens.map(([, valor]) => valor));

  return (
    <div className="breakdown">
      {itens.map(([rotulo, valor, extra]) => {
        const subs = Object.entries(subItens[rotulo] || {}).sort((a, b) => b[1] - a[1]);
        const clicavel = Boolean(aoClicar) && valor > 0;

        return (
          <div key={rotulo}>
            <div
              className={`breakdown-row ${clicavel ? "clicavel" : ""}`}
              onClick={clicavel ? () => aoClicar(rotulo) : undefined}
              role={clicavel ? "button" : undefined}
              tabIndex={clicavel ? 0 : undefined}
              onKeyDown={
                clicavel
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        aoClicar(rotulo);
                      }
                    }
                  : undefined
              }
            >
              <span className="breakdown-label">{extra || rotulo}</span>
              <span className="breakdown-valor">
                <span
                  className="breakdown-bar"
                  style={{
                    width: `${Math.round((valor / maximo) * 90)}px`,
                    ...(cores[rotulo] ? { background: cores[rotulo] } : {})
                  }}
                />
                <b>{valor}</b>
              </span>
            </div>

            {subs.map(([nome, quantidade]) => (
              <div className="breakdown-sub" key={`${rotulo}-${nome}`}>
                <span>↳ {nome}</span>
                <span>{quantidade}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
