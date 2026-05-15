import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, RotateCcw, X, AlertCircle, Edit2 } from 'lucide-react';

interface Barber {
  id: string;
  name: string;
  photo: string;
}

interface DeletedBarber {
  id: string;
  name: string;
  photo: string;
  user_id: string;
  deleted_at: string;
}

interface BarberManagerProps {
  userId: string;
  onSelect: (barber: Barber) => void;
  selectedBarberName?: string | null;
}

// Hook personnalisé pour détecter l'appui long (uniquement sur mobile/tactile)
function useLongPress(onLongPress: () => void, onClick: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const start = (e: React.TouchEvent | React.MouseEvent) => {
    // Enregistrer la position pour détecter le déplacement
    if ('touches' in e) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }
    
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress();
    }, 500);
  };

  const move = (e: React.TouchEvent | React.MouseEvent) => {
    // Si l'utilisateur a déplacé son doigt, annuler l'appui long
    if ('touches' in e) {
      const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);
      if (deltaX > 10 || deltaY > 10) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    }
  };

  const end = (e: React.TouchEvent | React.MouseEvent) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    // Petit délai pour s'assurer que l'appui long n'a pas été déclenché
    setTimeout(() => {
      if (!isLongPress.current) {
        onClick();
      }
    }, 10);
  };

  // Pour desktop, on utilise le clic normal
  const handleClick = () => {
    if (!('ontouchstart' in window)) {
      onClick();
    }
  };

  // Détecter si c'est un appareil mobile
  const isTouchDevice = 'ontouchstart' in window;

  if (!isTouchDevice) {
    return {
      onClick: handleClick,
    };
  }

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
  };
}

function ActionButtons({ onEdit, onDelete, isActive, isTouchDevice }: { onEdit: () => void; onDelete: () => void; isActive: boolean; isTouchDevice: boolean }) {
  return (
    <div className={`flex gap-1 transition-all duration-200 ${isActive || !isTouchDevice ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="bg-blue-500 hover:bg-blue-600 rounded-full p-1.5 transition-all shadow-lg"
        title="Modifier"
      >
        <Edit2 className="w-3 h-3 text-white" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="bg-red-500 hover:bg-red-600 rounded-full p-1.5 transition-all shadow-lg"
        title="Supprimer"
      >
        <Trash2 className="w-3 h-3 text-white" />
      </button>
    </div>
  );
}

export function BarberManager({ userId, onSelect, selectedBarberName }: BarberManagerProps) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [deletedBarbers, setDeletedBarbers] = useState<DeletedBarber[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Barber | null>(null);
  const [newName, setNewName] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [activeActionItem, setActiveActionItem] = useState<string | null>(null);

  const mounted = useRef(true);
  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;
  
  // Fermer les actions au clic ailleurs
  useEffect(() => {
    const handleClickOutside = () => setActiveActionItem(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchBarbers = async () => {
    const { data, error } = await supabase
      .from('barbers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (!error && data && mounted.current) setBarbers(data);
  };

  const fetchDeletedBarbers = async () => {
    const { data, error } = await supabase
      .from('deleted_barbers')
      .select('*')
      .eq('user_id', userId)
      .order('deleted_at', { ascending: false });
    if (!error && data && mounted.current) setDeletedBarbers(data);
  };

  useEffect(() => {
    fetchBarbers();
    fetchDeletedBarbers();
  }, [userId]);

  const handleAddBarber = async () => {
    if (!newName.trim()) {
      setValidationError('Le nom du coiffeur est obligatoire.');
      return;
    }
    if (!newFile) {
      setValidationError('Veuillez sélectionner une photo.');
      return;
    }
    setValidationError('');

    setIsUploading(true);
    try {
      const fileName = `${userId}/${Date.now()}-${newFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('barbers')
        .upload(fileName, newFile);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('barbers').getPublicUrl(fileName);
      const { error: insertError } = await supabase
        .from('barbers')
        .insert([{ name: newName.trim(), photo: data.publicUrl, user_id: userId }]);
      if (insertError) throw insertError;
      await fetchBarbers();
      if (mounted.current) {
        setAdding(false); 
        setNewName(''); 
        setNewFile(null); 
        setPreview(null);
        setValidationError('');
      }
    } catch (error) {
      console.error('Erreur ajout coiffeur:', error);
      alert('Erreur lors de l\'ajout du coiffeur');
    } finally {
      if (mounted.current) setIsUploading(false);
    }
  };

  const handleEditBarber = async () => {
    if (!editing) return;
    
    if (!newName.trim()) {
      setValidationError('Le nom du coiffeur est obligatoire.');
      return;
    }
    setValidationError('');

    setIsUploading(true);
    try {
      let photoUrl = editing.photo;
      
      if (newFile) {
        const fileName = `${userId}/${editing.id}/${Date.now()}-${newFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('barbers')
          .upload(fileName, newFile);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('barbers').getPublicUrl(fileName);
        photoUrl = data.publicUrl;
      }
      
      const { error: updateError } = await supabase
        .from('barbers')
        .update({ name: newName.trim(), photo: photoUrl })
        .eq('id', editing.id);
      
      if (updateError) throw updateError;
      
      await fetchBarbers();
      if (mounted.current) {
        setEditing(null);
        setNewName('');
        setNewFile(null);
        setPreview(null);
        setValidationError('');
      }
    } catch (error) {
      console.error('Erreur modification coiffeur:', error);
      alert('Erreur lors de la modification du coiffeur');
    } finally {
      if (mounted.current) setIsUploading(false);
    }
  };

  const handleDeleteBarber = async (barberId: string, photoUrl: string, barberName: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer ${barberName} ?`)) return;
    try {
      const { error: insertDeletedError } = await supabase
        .from('deleted_barbers')
        .insert([{ 
          id: barberId, 
          name: barberName, 
          photo: photoUrl,
          user_id: userId 
        }]);
      
      if (insertDeletedError) throw insertDeletedError;

      const { error } = await supabase.from('barbers').delete().eq('id', barberId);
      if (error) throw error;
      
      if (mounted.current) {
        setBarbers(barbers.filter((b) => b.id !== barberId));
        await fetchDeletedBarbers();
        setActiveActionItem(null);
      }
    } catch (error) {
      console.error('Erreur suppression coiffeur:', error);
      alert('Erreur lors de la suppression du coiffeur');
    }
  };

  const handleRestoreBarber = async (deletedBarber: DeletedBarber) => {
    if (!confirm(`Restaurer ${deletedBarber.name} ?`)) return;
    try {
      const { error: restoreError } = await supabase
        .from('barbers')
        .insert([{ 
          id: deletedBarber.id, 
          name: deletedBarber.name, 
          photo: deletedBarber.photo,
          user_id: userId 
        }]);
      
      if (restoreError) throw restoreError;
      
      const { error: deleteError } = await supabase
        .from('deleted_barbers')
        .delete()
        .eq('id', deletedBarber.id);
      
      if (deleteError) throw deleteError;
      
      await fetchBarbers();
      await fetchDeletedBarbers();
    } catch (error) {
      console.error('Erreur restauration coiffeur:', error);
      alert('Erreur lors de la restauration');
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setNewFile(file);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
      setValidationError('');
    }
  };

  const handleNameChange = (value: string) => {
    setNewName(value);
    if (validationError && value.trim()) setValidationError('');
  };

  const openEditModal = (barber: Barber) => {
    setEditing(barber);
    setNewName(barber.name);
    setPreview(barber.photo);
    setNewFile(null);
    setValidationError('');
    setActiveActionItem(null);
  };

  useEffect(() => {
    return () => { if (preview && preview !== editing?.photo) URL.revokeObjectURL(preview); };
  }, [preview]);

  // Fonction de sélection simplifiée
  const handleSelectBarber = (barber: Barber) => {
    onSelect(barber);
  };

  // Composant Coiffeur
  const BarberItem = ({ barber }: { barber: Barber }) => {
    const isActive = activeActionItem === `barber-${barber.id}`;
    
    const longPressProps = useLongPress(
      () => {
        // Appui long - afficher les actions (uniquement sur mobile)
        setActiveActionItem(`barber-${barber.id}`);
      },
      () => {
        // Clic simple - sélectionner le coiffeur
        handleSelectBarber(barber);
      }
    );

    // Pour desktop, on utilise onClick directement
    const handleClick = () => {
      if (!isTouchDevice) {
        handleSelectBarber(barber);
      }
    };

    return (
      <div className="relative text-center group">
        <div
          {...(isTouchDevice ? longPressProps : { onClick: handleClick })}
          className={`w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full mb-2 transition-all cursor-pointer ${
            selectedBarberName === barber.name
              ? 'ring-4 ring-green-500 ring-offset-2 ring-offset-black scale-110'
              : 'hover:scale-105'
          }`}
        >
          <img
            src={barber.photo}
            alt={barber.name}
            className="w-full h-full rounded-full object-cover border-2 border-zinc-700"
          />
        </div>
        <span
          className={`block text-sm font-medium ${
            selectedBarberName === barber.name ? 'text-green-400' : 'text-gray-300'
          }`}
        >
          {barber.name}
        </span>
        
        {/* Boutons d'action */}
        <div className={`absolute -top-2 -right-2 ${!isTouchDevice ? 'opacity-0 group-hover:opacity-100' : ''}`}>
          <ActionButtons
            onEdit={() => openEditModal(barber)}
            onDelete={() => handleDeleteBarber(barber.id, barber.photo, barber.name)}
            isActive={isActive}
            isTouchDevice={isTouchDevice}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 items-center">
        {barbers.map((barber) => (
          <BarberItem key={barber.id} barber={barber} />
        ))}

        <div
          onClick={() => setAdding(true)}
          className="flex flex-col justify-center items-center w-20 h-20 sm:w-24 sm:h-24 border-2 border-dashed border-zinc-600 rounded-full cursor-pointer text-gray-400 hover:text-white hover:border-white hover:scale-105 transition-all"
        >
          <Plus className="w-6 h-6 sm:w-8 sm:h-8 mb-1" />
          <span className="text-xs">Ajouter</span>
        </div>
      </div>

      {/* Section coiffeurs supprimés */}
      {deletedBarbers.length > 0 && (
        <div className="border-t border-zinc-800 pt-4">
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 mb-3"
          >
            {showDeleted ? '▼' : '▶'} Coiffeurs supprimés ({deletedBarbers.length})
          </button>
          
          {showDeleted && (
            <div className="flex flex-wrap gap-4">
              {deletedBarbers.map((deleted) => (
                <div key={deleted.id} className="relative text-center group">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full mb-2">
                    <img
                      src={deleted.photo}
                      alt={deleted.name}
                      className="w-full h-full rounded-full object-cover border-2 border-zinc-700 opacity-60"
                    />
                  </div>
                  <span className="block text-sm text-gray-500">
                    {deleted.name}
                  </span>
                  <button
                    onClick={() => handleRestoreBarber(deleted)}
                    className="absolute -top-2 -right-2 bg-green-500 hover:bg-green-600 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all"
                    title="Restaurer"
                  >
                    <RotateCcw className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal d'ajout */}
      {adding && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setAdding(false)}>
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Ajouter un coiffeur</h3>
              <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {preview && (
                <div className="flex justify-center">
                  <img
                    src={preview}
                    alt="Aperçu"
                    className="w-24 h-24 rounded-full object-cover border-2 border-zinc-700"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom du coiffeur <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Jean Dupont"
                  value={newName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Photo <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition-colors file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-white file:text-black hover:file:bg-gray-200"
                  />
                </div>
              </div>

              {validationError && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 p-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleAddBarber}
                  disabled={isUploading || !newFile || !newName.trim()}
                  className="flex-1 bg-white text-black py-3 rounded-xl font-semibold hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? 'Ajout en cours...' : 'Ajouter'}
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setPreview(null);
                    setNewName('');
                    setNewFile(null);
                    setValidationError('');
                  }}
                  className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-semibold hover:bg-zinc-700 transition"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Modifier le coiffeur</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {preview && (
                <div className="flex justify-center">
                  <img
                    src={preview}
                    alt="Aperçu"
                    className="w-24 h-24 rounded-full object-cover border-2 border-zinc-700"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom du coiffeur <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Jean Dupont"
                  value={newName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Photo (laisser vide pour conserver l'actuelle)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition-colors file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-white file:text-black hover:file:bg-gray-200"
                  />
                </div>
              </div>

              {validationError && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 p-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleEditBarber}
                  disabled={isUploading || !newName.trim()}
                  className="flex-1 bg-white text-black py-3 rounded-xl font-semibold hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? 'Modification en cours...' : 'Modifier'}
                </button>
                <button
                  onClick={() => {
                    setEditing(null);
                    setPreview(null);
                    setNewName('');
                    setNewFile(null);
                    setValidationError('');
                  }}
                  className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-semibold hover:bg-zinc-700 transition"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}