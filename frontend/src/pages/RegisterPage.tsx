import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

const RegisterPage = () => {
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const mutation = useMutation({
    mutationFn: (data: RegisterFormValues) => {
      return api.post('/auth/register', data);
    },
    onSuccess: () => {
      // Redirect to login page after successful registration
      navigate('/login');
    },
    onError: (error) => {
      console.error('Registration failed:', error);
      // Here you would typically set an error message in the state to show to the user
    },
  });

  const onSubmit = (data: RegisterFormValues) => {
    mutation.mutate(data);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center">Create an Account</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {mutation.isError && (
            <div className="p-4 text-sm text-red-700 bg-red-100 rounded-lg">
              Registration failed. Please try again.
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" {...register('username')} />
            {errors.username && <p className="text-xs text-red-500">{errors.username.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" placeholder="m@example.com" {...register('email')} />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register('password')} />
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Registering...' : 'Register'}
          </Button>
        </form>
        <p class="text-sm text-center text-gray-600">
          Already have an account? <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">Log in</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
