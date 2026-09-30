import { redirect } from "next/navigation";

// Le middleware protège déjà les routes ; ici on redirige simplement
// la racine "/" vers le dashboard (ou /login si non connecté, géré par le middleware).
export default function Home() {
  redirect("/dashboard");
}
