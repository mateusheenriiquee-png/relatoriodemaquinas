-- Palavras-chave do chat editáveis no painel (2026-10-13).
--
-- A lista que decide se uma mensagem do cliente vai para a IA ficava escrita
-- dentro do workflow do n8n: qualquer palavra nova exigia gerar e importar um
-- workflow. Agora ela vive na linha "palavras_chave_suporte" da tabela config
-- (o admin edita na tela Admin) e o n8n a lê a cada mensagem pela função abaixo.
-- Se o banco não responder, o n8n usa a lista embutida como reserva.

insert into public.config (chave, valor)
values ('palavras_chave_suporte', '{"lista":["instalar","instalacao","instalei","instalou","instalo","instalando","reinstalar","baixar o certificado","download","driver","safenet","safesign","token","leitora","leitor de cartao","erro","erros","deu erro","nao funciona","nao esta funcionando","nao ta funcionando","parou de funcionar","nao aparece","nao reconhece","nao reconheceu","nao encontra","nao encontrou","nao consigo","nao consegui","nao to conseguindo","nao tou conseguindo","nao estou conseguindo","nao ta conseguindo","nao conseguindo","nao consigo acessar","acessar","acesso","nao entra","nao entrou","nao acessa","nao abre o","nao abre","nao abriu","nao carrega","travou","travando","falha","problema","problemas","bug","invalido","invalida","senha","pin","puk","bloqueado","bloqueada","bloqueou","esqueci","exportar","exportacao","backup","pfx","copia de seguranca","outro computador","outra maquina","outro notebook","formatei","formatar","trocar de computador","como uso","como usar","como utilizo","como utilizar","como faco","como faz","como assino","assinar","emitir nota","nota fiscal","nfe","nfse","e-cac","ecac","gov.br","sefaz","receita federal","esocial","pje","procuracao eletronica","contabilidade","contador","ajuda","me ajuda","suporte","socorro","tutorial","passo a passo","ajudar","ajudam","ajudem","informacao","informacoes","apoio","auxiliar","auxilio","orientacao","orientar","duvida","duvidas","assinatura","assinaturas","aplicativo","app","link","nao quer","nao deu certo","nao da certo","nao recebo","nao recebi","nao recebemos","nao chegou","nao chega","nao veio","nao enviou","nao mandou","arquivo","arquivos","certificado","certificados","email do certificado","validacao","validar","nao deu","nao funcionou","nao resolveu","nao adiantou","continua dando","continua com erro","de novo","novamente","nao sei","nao entendi","nao consigo baixar","nao baixa","nao baixou","nao instala","nao instalou","nao assina","nao assinou","nao emite","nao emitiu","nao gera","nao gerou","nao salva","nao salvou","expirou","expirado","vencido","vencida","vencimento","revogado","revogada","inapto","inapta","travado","travada","lento","fora do ar","sem acesso","sem resposta","tela branca","tela preta","pendrive","pen drive","usb","windows","navegador","chrome","java","cartao","certificado digital","preciso de ajuda","preciso de suporte","pode me ajudar","alguem me ajuda","atendimento","urgente","urgencia","falar com o tecnico","falar com tecnico","suporte tecnico","equipe tecnica","tecnico","chave","chave de emissao","nao achei","nao acho","nao encontro","nao localizo","localizando","nao to achando","nao estou achando","perdi","sumiu","reenviar","reenvia","mandar de novo"],"atualizado_por":"Migração (lista que estava no workflow)","atualizado_em":"2026-10-13T00:00:00Z"}'::jsonb)
on conflict (chave) do nothing;

-- n8n (chave anon) -> a lista atual. Só leitura e só esta chave: nada mais da
-- tabela config fica exposto.
create or replace function public.palavras_chave_suporte()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('lista', coalesce(
    (select valor->'lista' from public.config where chave = 'palavras_chave_suporte'),
    '[]'::jsonb
  ));
$$;

grant execute on function public.palavras_chave_suporte() to anon, authenticated;
revoke execute on function public.palavras_chave_suporte() from public;
