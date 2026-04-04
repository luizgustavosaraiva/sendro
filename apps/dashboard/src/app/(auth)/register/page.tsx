import { renderAuthLayout, renderRoleSelector, roleSpecificFields } from "../shared";

export default function RegisterPage() {
  const role = "company";
  const companyFields = roleSpecificFields("company", {});
  const retailerFields = roleSpecificFields("retailer", {});
  const driverFields = roleSpecificFields("driver", {});

  return renderAuthLayout(
    {
      title: "Cadastro Sendro",
      action: "/register",
      submitLabel: "Criar conta"
    },
    `<form method="post" action="/register">
      <label>Nome<input name="name" autocomplete="name" required /></label>
      <label>E-mail<input type="email" name="email" autocomplete="email" required /></label>
      <label>Senha<input type="password" name="password" autocomplete="new-password" required minlength="8" /></label>
      ${renderRoleSelector(role)}
      <div id="role-fields">${companyFields}</div>
      <button type="submit">Criar conta</button>
      <div class="switcher"><span>Já possui conta?</span><a href="/login">Entrar</a></div>
    </form>
    <script>
      const select = document.getElementById('role-select');
      const container = document.getElementById('role-fields');
      const templates = {
        company: ${JSON.stringify(companyFields)},
        retailer: ${JSON.stringify(retailerFields)},
        driver: ${JSON.stringify(driverFields)}
      };
      select?.addEventListener('change', (event) => {
        const target = event.target;
        container.innerHTML = templates[target.value] ?? templates.company;
      });
    </script>`
  );
}
