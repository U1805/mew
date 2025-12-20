import User, { IUser } from './user.model';


class UserRepository {
  public async findById(userId: string): Promise<IUser | null> {
    return User.findById(userId);
  }

  public async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email });
  }

  public async findByIdWithPassword(userId: string): Promise<IUser | null> {
    return User.findById(userId).select('+password');
  }

  public async findByEmailWithPassword(email: string): Promise<IUser | null> {
    return User.findOne({ email }).select('+password');
  }

  public async create(userData: Partial<IUser>): Promise<IUser> {
    return User.create(userData);
  }

  public async updateById(userId: string, updateData: Partial<IUser>): Promise<IUser | null> {
    return User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true, context: 'query' });
  }

  public async find(query: any, projection: any = {}, limit = 0): Promise<IUser[]> {
    return User.find(query)
      .limit(limit)
      .select(projection);
  }
}

export const userRepository = new UserRepository();
