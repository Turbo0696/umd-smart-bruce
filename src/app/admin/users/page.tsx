import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateUserForm } from "./CreateUserForm";
import { RoleSelect } from "./RoleSelect";

export default async function AdminUsersPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") {
    notFound();
  }

  const users = await prisma.profile.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Users
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Manage roles for everyone who has signed in. Changes apply immediately.
      </p>

      <div className="mt-6">
        <CreateUserForm />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500 dark:text-zinc-500">
              <th className="border-b border-zinc-200 px-4 py-2 font-normal dark:border-zinc-700">
                Name
              </th>
              <th className="border-b border-zinc-200 px-4 py-2 font-normal dark:border-zinc-700">
                Email
              </th>
              <th className="border-b border-zinc-200 px-4 py-2 font-normal dark:border-zinc-700">
                Joined
              </th>
              <th className="border-b border-zinc-200 px-4 py-2 font-normal dark:border-zinc-700">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {u.name ?? "—"}
                </td>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {u.email}
                </td>
                <td className="px-4 py-2 text-zinc-500 dark:text-zinc-500">
                  {u.createdAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-2">
                  <RoleSelect userId={u.id} role={u.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
