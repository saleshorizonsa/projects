"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function loginAction(
  _prev: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const email = (formData.get("email") ?? "").toString().toLowerCase().trim();
  const password = (formData.get("password") ?? "").toString();
  if (!email || !password) return "Enter your email and password.";
  try {
    await signIn("credentials", { email, password, redirectTo: "/projects" });
  } catch (error) {
    if (error instanceof AuthError) return "Invalid email or password.";
    throw error; // re-throw the redirect
  }
}

export async function signupAction(
  _prev: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const email = (formData.get("email") ?? "").toString().toLowerCase().trim();
  const password = (formData.get("password") ?? "").toString();
  const name = (formData.get("name") ?? "").toString().trim();
  if (!email || !password) return "Enter your email and password.";
  if (password.length < 8) return "Password must be at least 8 characters.";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return "An account with that email already exists.";

  // First account to register becomes the admin.
  const userCount = await prisma.user.count();
  const role = userCount === 0 ? "admin" : "member";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { email, name: name || null, passwordHash, role },
  });

  // Link a directory Person (match by email, else create) for team membership.
  const person = await prisma.person.findFirst({
    where: { email, userId: null },
  });
  if (person) {
    await prisma.person.update({
      where: { id: person.id },
      data: { userId: user.id },
    });
  } else {
    await prisma.person.create({
      data: { name: name || email, email, userId: user.id },
    });
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/projects" });
  } catch (error) {
    if (error instanceof AuthError) return "Could not sign you in. Try logging in.";
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
