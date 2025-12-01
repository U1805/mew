import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Modal from './Modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useModalStore, useUIStore } from '../../store';
import { categoryApi } from '../../services/api';

vi.mock('../../store');
vi.mock('../../services/api');

const queryClient = new QueryClient();
const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('Modals - Category Management', () => {
  const mockCloseModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUIStore).mockReturnValue({ currentServerId: 'server-1' });
    // Create a spy on queryClient.invalidateQueries
    queryClient.invalidateQueries = vi.fn();
  });

  describe('Edit Category Modal', () => {
    const mockCategory = { _id: 'category-1', name: 'Original Name' };

    it('renders with initial name and calls update API on save', async () => {
      vi.mocked(useModalStore).mockReturnValue({
        activeModal: 'editCategory',
        modalData: { category: mockCategory },
        closeModal: mockCloseModal,
      });

      vi.mocked(categoryApi.update).mockResolvedValue({ data: {} });

      render(<Modal />, { wrapper });

      const input = screen.getByDisplayValue('Original Name');
      expect(input).toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'Updated Name' } });
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(categoryApi.update).toHaveBeenCalledWith('category-1', {
          name: 'Updated Name',
        });
      });

      await waitFor(() => {
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['categories', 'server-1'] });
        expect(mockCloseModal).toHaveBeenCalled();
      });
    });
  });

  describe('Delete Category Modal', () => {
    const mockCategory = { _id: 'category-1', name: 'To Be Deleted' };

    it('shows confirmation and calls delete API on confirm', async () => {
      vi.mocked(useModalStore).mockReturnValue({
        activeModal: 'deleteCategory',
        modalData: { category: mockCategory },
        closeModal: mockCloseModal,
      });

      vi.mocked(categoryApi.delete).mockResolvedValue({});

      render(<Modal />, { wrapper });

      expect(screen.getByText(/Are you sure you want to delete the category/)).toBeInTheDocument();

      const deleteButton = screen.getByRole('button', { name: 'Delete Category' });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(categoryApi.delete).toHaveBeenCalledWith('category-1');
      });

      await waitFor(() => {
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['categories', 'server-1'] });
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['channels', 'server-1'] });
        expect(mockCloseModal).toHaveBeenCalled();
      });
    });
  });
});
