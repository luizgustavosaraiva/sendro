import { renderAuthLayout } from "../shared";

export default function LoginPage() {
  return renderAuthLayout(
    {
      title: "Login Sendro",
      action: "/login",
      submitLabel: "Entrar"
    },
    `<form method="post" action="/login">
      <label>E-mail<input type="email" name="email" autocomplete="email" required /></label>
      <label>Senha<input type="password" name="password" autocomplete="current-password" required /></label>
      <button type="submit">Entrar</button>
      <div class="switcher"><span>Novo por aqui?</span><a href="/register">Criar conta</a></div>
    </form>`
  );
}
