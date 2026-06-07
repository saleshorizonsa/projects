// One-time Phase 5 backfill: create the admin user and assign all existing
// (ownerless) projects to them, so nothing is lost when ownership is introduced.
// Run once after the phase5_auth migration:  npx tsx prisma/backfill-phase5.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "shareef6695@gmail.com";
const DEFAULT_PASSWORD = "changeme123"; // change this on first login

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "admin" },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin",
      passwordHash,
      role: "admin",
    },
  });

  // Claim every ownerless project for the admin.
  const claimed = await prisma.project.updateMany({
    where: { ownerId: null },
    data: { ownerId: admin.id },
  });

  // Link a directory Person to the admin (match by email, else create).
  const existing = await prisma.person.findFirst({
    where: { email: ADMIN_EMAIL, userId: null },
  });
  if (existing) {
    await prisma.person.update({
      where: { id: existing.id },
      data: { userId: admin.id },
    });
  } else {
    const alreadyLinked = await prisma.person.findUnique({
      where: { userId: admin.id },
    });
    if (!alreadyLinked) {
      await prisma.person.create({
        data: { name: "Admin", email: ADMIN_EMAIL, userId: admin.id },
      });
    }
  }

  console.log(
    `Backfill done. Admin: ${ADMIN_EMAIL} (password "${DEFAULT_PASSWORD}" — change it). Projects claimed: ${claimed.count}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
