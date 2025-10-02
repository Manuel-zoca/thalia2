const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot hospedado com sucesso!"));

app.listen(PORT, () => {
  console.log(`Servidor web rodando na porta ${PORT}`);
});
