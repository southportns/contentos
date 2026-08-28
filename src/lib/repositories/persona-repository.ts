import { Prisma, Persona } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'

export const personaRepository = {
  async create(data: Prisma.PersonaCreateInput): Promise<Persona> {
    return prisma.persona.create({ data })
  },

  async findByUserId(userId: string): Promise<Persona[]> {
    return prisma.persona.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })
  },

  async findById(id: string): Promise<Persona | null> {
    return prisma.persona.findUnique({ where: { id } })
  },

  async update(id: string, data: Prisma.PersonaUpdateInput): Promise<Persona> {
    return prisma.persona.update({ where: { id }, data })
  },

  async delete(id: string): Promise<void> {
    await prisma.persona.delete({ where: { id } })
  },
}
