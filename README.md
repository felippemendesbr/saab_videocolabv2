# SAAB VideoColab

Aplicação web para geração de vídeos institucionais personalizados utilizando apenas APIs nativas do navegador (HTML5 Canvas, `captureStream()` e `MediaRecorder`), sem uso de FFmpeg ou bibliotecas externas de vídeo.

## Funcionalidades

- **Login por e-mail**: apenas e-mails autorizados (array no backend) podem acessar a dashboard.
- **Upload de foto**: validação de formato (JPG/JPEG/PNG) e tamanho máximo de 5MB.
- **Canvas 1920x1080**: usado para renderizar:
  - introdução com foto do colaborador;
  - textos personalizados (\"Bem-vindo\" + nome extraído do e-mail);
  - vídeo institucional.
- **Intro de 3 segundos**: fundo escuro, foto centralizada, textos abaixo.
- **Vídeo institucional**: reproduzido a partir de `/public/assets/video_institucional.mp4`, renderizado dentro do canvas.
- **Gravação do vídeo final**:
  - captura o stream do canvas via `canvas.captureStream()`;
  - adiciona a trilha de áudio do vídeo institucional (quando disponível) via `video.captureStream()`;
  - grava tudo com `MediaRecorder`;
  - gera arquivo final `video-colaborador.webm`.
- **Download do vídeo**: botão \"Baixar meu vídeo\" após finalizar a gravação.

## Estrutura de pastas

```text
saab-videocolab
│
├── server.js
├── package.json
├── README.md
│
├── routes
│   └── authRoutes.js
│
├── public
│   │
│   ├── css
│   │   └── styles.css
│   │
│   ├── js
│   │   └── app.js
│   │
│   └── assets
│       └── video_institucional.mp4   (forneça seu vídeo aqui)
│
└── views
    ├── login.html
    └── dashboard.html
```

> **Importante:** o arquivo `video_institucional.mp4` **não é fornecido** neste repositório. Você deve colocar o seu vídeo institucional em `public/assets/video_institucional.mp4`.
>
> Para o fluxo atual de produção, use estes arquivos em `public/assets`:
> - `VIDEO PT1.mp4`
> - `trilha.mp3`
> - `VIDEO PT2.mp4`

## Requisitos

- Node.js (>= 14.x recomendado)
- Navegador moderno com suporte a:
  - `HTML5 Canvas`
  - `HTMLMediaElement.captureStream()`
  - `MediaRecorder`

## Instalação

Na pasta raiz do projeto (`saab-videocolab`):

```bash
npm install
```

Isso instalará as dependências:

- `express`
- `express-session`
- `body-parser`
- `mysql2`
- `bcryptjs`
- `multer`
- `xlsx`

## Execução

Ainda na raiz do projeto:

```bash
node server.js
```

Ou, utilizando o script:

```bash
npm start
```

A aplicação ficará disponível em:

```text
http://localhost:3001
```

## Configuração de e-mails permitidos

Agora os e-mails/senhas permitidos vêm da tabela `users` no banco MySQL.
E-mail admin fixo: `comunicacao.saab@owly.com.br`.

## Fluxo de uso

1. Acesse `http://localhost:3001`.
2. Informe um e-mail autorizado.
3. Ao ser redirecionado para a dashboard:
   - faça upload da foto;
   - confira o preview;
   - clique em **Gerar Vídeo**.
4. Aguarde o indicador de processamento.
5. Quando pronto, o botão **Baixar meu vídeo** será exibido.
6. Faça download do arquivo `video-colaborador.webm` e utilize em:
   - LinkedIn;
   - Instagram;
   - ou outras redes que aceitem `.webm`.

## Observações técnicas

- A composição do vídeo é feita inteiramente em um `<canvas>` controlado pelo navegador, com animações de intro, transição e vídeo institucional.
- O stream de vídeo base é obtido com `canvas.captureStream(30)`.
- Quando disponível, a trilha de áudio do vídeo institucional é adicionada à stream de gravação a partir de `video.captureStream()`.
- A captura é iniciada antes da introdução, grava a intro completa, a transição e segue até o final do vídeo institucional.
- O navegador gera um arquivo `webm`, que é então enviado ao backend e **convertido para MP4** usando FFmpeg.
- É necessário ter o **FFmpeg instalado e acessível no PATH** do sistema operacional para que a conversão para MP4 funcione.
- No primeiro start, o sistema cria automaticamente o usuário admin (`comunicacao.saab@owly.com.br`) com senha padrão `Admin@123` (ou valor de `ADMIN_DEFAULT_PASSWORD`).

