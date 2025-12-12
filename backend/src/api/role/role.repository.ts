import Role from './role.model';
import { IRole } from './role.model';

class RoleRepository {
  private model = Role;

  async create(data: any): Promise<IRole> {
    const role = new this.model(data);
    return role.save();
  }

  async findOne(filter: any, sort?: any): Promise<IRole | null> {
    return this.model.findOne(filter).sort(sort).exec();
  }

  async find(filter: any, sort?: any): Promise<IRole[]> {
    return this.model.find(filter).sort(sort).exec();
  }

  async findById(id: string): Promise<IRole | null> {
    return this.model.findById(id).exec();
  }

  async updateById(id: string, data: Partial<IRole>): Promise<IRole | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async bulkWrite(ops: any[]): Promise<any> {
    return this.model.bulkWrite(ops);
  }

  async deleteOne(filter: any): Promise<any> {
    return this.model.deleteOne(filter);
  }

}

export const roleRepository = new RoleRepository();
