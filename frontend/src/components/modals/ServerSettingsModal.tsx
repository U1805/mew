import React, { useState, useEffect } from 'react';
import { useModalStore } from '../../store';
import { Icon } from '@iconify/react';

export const ServerSettingsModal: React.FC = () => {
  const { closeModal, modalData, openModal } = useModalStore();
  const [name, setName] = useState('');

  useEffect(() => {
    if (modalData?.server) {
      setName(modalData.server.name || '');
    }
  }, [modalData]);

  return (
    <div className="fixed inset-0 z-50 flex bg-[#313338] animate-fade-in text-mew-text font-sans">
         <div className="w-[30%] min-w-[220px] bg-[#2B2D31] flex flex-col items-end pt-[60px] pb-4 px-2">
             <div className="w-[192px] px-1.5">
                <h2 className="text-xs font-bold text-mew-textMuted uppercase mb-3 px-2.5">Server Settings</h2>
                <div className="px-2.5 py-1.5 rounded-[4px] bg-[#404249] text-white font-medium text-sm cursor-pointer mb-0.5">Overview</div>
                <div className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5">Roles</div>
                <div className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5">Emoji</div>
                <div className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5">Stickers</div>

                <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50"></div>

                <div
                    className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5 flex justify-between group"
                    onClick={() => openModal('deleteServer', modalData)}
                >
                    <span className="group-hover:text-red-400">Delete Server</span>
                    <Icon icon="mdi:trash-can-outline" className="hidden group-hover:block text-red-400" />
                </div>
             </div>
         </div>
         <div className="flex-1 bg-[#313338] pt-[60px] px-10 max-w-[740px]">
             <h2 className="text-xl font-bold text-white mb-6">Server Overview</h2>
             <div className="flex gap-8">
                 <div className="flex items-center justify-center">
                     <div className="w-[100px] h-[100px] rounded-full bg-mew-accent flex items-center justify-center relative group cursor-pointer">
                         <div className="text-white text-3xl font-bold">{modalData?.server?.name?.substring(0,2).toUpperCase()}</div>
                         <div className="absolute top-0 right-0 bg-white rounded-full p-1 shadow-md">
                             <Icon icon="mdi:image-plus" className="text-black" width="16" />
                         </div>
                         <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-white uppercase">
                             Change Icon
                         </div>
                     </div>
                 </div>
                 <div className="flex-1 space-y-4">
                     <div>
                        <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Server Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
                        />
                     </div>
                     <div className="flex gap-4">
                         <button className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors">Save Changes</button>
                         <button onClick={closeModal} className="text-white hover:underline text-sm font-medium px-2 self-center">Cancel</button>
                     </div>
                 </div>
             </div>
         </div>
         <div className="w-[18%] min-w-[60px] pt-[60px] pl-5">
             <div className="flex flex-col items-center cursor-pointer group" onClick={closeModal}>
                 <div className="w-9 h-9 rounded-full border-[2px] border-mew-textMuted group-hover:bg-mew-textMuted/20 flex items-center justify-center transition-colors mb-1">
                     <Icon icon="mdi:close" className="text-mew-textMuted group-hover:text-white" width="24" height="24" />
                 </div>
                 <span className="text-xs font-bold text-mew-textMuted group-hover:text-white transition-colors">ESC</span>
             </div>
         </div>
    </div>
  )
}