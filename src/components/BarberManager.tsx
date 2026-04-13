import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, RotateCcw, X } from 'lucide-react';

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

export function BarberManager({ userId, onSelect, selectedBarberName }: BarberManagerProps) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [deletedBarbers, setDeletedBarbers] = useState<DeletedBarber[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const mounted = useRef(true);
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
    if (!newName || !newFile) return;
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
        .insert([{ name: newName, photo: data.publicUrl, user_id: userId }]);
      if (insertError) throw insertError;
      await fetchBarbers();
      if (mounted.current) {
        setAdding(false); 
        setNewName(''); 
        setNewFile(null); 
        setPreview(null);
      }
    } catch (error) {
      console.error('Erreur ajout coiffeur:', error);
      alert('Erreur lors de l\'ajout du coiffeur');
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
    }
  };

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  return (
    <div className="flex flex-col gap-6">
      {/* Liste des coiffeurs actifs */}
      <div className="flex flex-wrap gap-4 items-center">
        {barbers.map((barber) => (
          <div key={barber.id} className="relative text-center cursor-pointer group">
            <div
              onClick={() => onSelect(barber)}
              className={`w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full mb-2 transition-all ${
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
            <button
              onClick={() => handleDeleteBarber(barber.id, barber.photo, barber.name)}
              className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all"
              title="Supprimer"
            >
              <Trash2 className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}

        {/* Bouton ajouter */}
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

      {/* Modal d'ajout simplifié */}
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
              {/* Aperçu */}
              {preview && (
                <div className="flex justify-center">
                  <img
                    src={preview}
                    alt="Aperçu"
                    className="w-24 h-24 rounded-full object-cover border-2 border-zinc-700"
                  />
                </div>
              )}

              {/* Champ nom */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom du coiffeur
                </label>
                <input
                  type="text"
                  placeholder="Ex: Jean Dupont"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition-colors"
                  autoFocus
                />
              </div>

              {/* Champ photo */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Photo
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

              {/* Boutons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleAddBarber}
                  disabled={isUploading || !newName || !newFile}
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