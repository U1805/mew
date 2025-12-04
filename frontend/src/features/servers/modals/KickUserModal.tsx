import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { serverApi } from '../../../shared/services/api';
import { useModalStore } from '../../../shared/stores/store';

export const KickUserModal: React.FC = () => {
    const { closeModal, modalData } = useModalStore();
    const queryClient = useQueryClient();
    const [isLoading, setIsLoading] = useState(false);

    const user = modalData?.user;
    const serverId = modalData?.serverId;

    if (!user || !serverId) return null;

    const handleSubmit = async () => {
        setIsLoading(true);
        try {
            await serverApi.kickMember(serverId, user._id);
            queryClient.invalidateQueries({ queryKey: ['members', serverId] });
            closeModal();
        } catch (error) {
            console.error("Failed to kick user", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#313338] w-full max-w-[440px] rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in">
                <div className="p-4 pt-5">
                    <h2 className="text-xl font-bold text-white mb-4">Kick &apos;{user.username}&apos;</h2>
                    <p className="text-mew-textMuted text-sm leading-5">
                        Are you sure you want to kick <span className="font-semibold text-white">@{user.username}</span> from the server? They will be able to rejoin again with a new invite.
                    </p>
                </div>

                <div className="bg-[#2B2D31] p-4 flex justify-end items-center space-x-3">
                    <button
                        type="button"
                        onClick={closeModal}
                        className="text-white hover:underline text-sm font-medium px-4"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors"
                    >
                        Kick
                    </button>
                </div>
            </div>
        </div>
    );
};