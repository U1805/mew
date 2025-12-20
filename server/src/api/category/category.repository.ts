import Category, { ICategory } from './category.model';

class CategoryRepository {
  public async create(name: string, serverId: string): Promise<ICategory> {
    return Category.create({ name, serverId });
  }

  public async findByServer(serverId: string): Promise<ICategory[]> {
    return Category.find({ serverId });
  }

  public async findById(categoryId: string): Promise<ICategory | null> {
    return Category.findById(categoryId);
  }

  public async updateById(
    categoryId: string,
    data: Partial<Pick<ICategory, 'name' | 'position'>>
  ): Promise<ICategory | null> {
    // In the service, the category is saved, so we mimic that behavior here for now.
    const category = await this.findById(categoryId);
    if (!category) {
      return null;
    }
    Object.assign(category, data);
    await category.save();
    return category;
  }

  public async deleteById(categoryId: string): Promise<void> {
    const category = await this.findById(categoryId);
    if (category) {
      await category.deleteOne();
    }
  }
}

export const categoryRepository = new CategoryRepository();
