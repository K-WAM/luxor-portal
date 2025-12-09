import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="flex gap-6 p-4 shadow">
      <Link href="/">Home</Link>
      <Link href="/owner">Owner Portal</Link>
      <Link href="/tenant">Tenant Portal</Link>
      <Link href="/admin">Admin Portal</Link>
    </nav>
  );
}
