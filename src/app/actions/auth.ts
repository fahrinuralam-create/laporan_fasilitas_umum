"use server";

import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
}) {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    return { error: "Email sudah terdaftar" };
  }

  const hashedPassword = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashedPassword,
      role: "MASYARAKAT",
    },
  });

  return { success: true, user: { id: user.id, name: user.name, email: user.email } };
}
