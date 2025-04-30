# TODO
# To get a point cloud
# To get a 3D volume
import os
import pandas as pd
from PyNutil.io.read_and_write import load_quint_json, write_points_to_meshview
from PyNutil.processing.transformations import image_to_atlas_space
import cv2
import numpy as np
import matplotlib.pyplot as plt
from utilities.generate_target_slice import generate_target_coordinates
from utilities.alignment_functions import (
    read_ants_affine,
    read_nonlinear,
    apply_affine_to_image,
    apply_nonlinear_to_image,
)
from utilities.center_images_from_alignment import (
    perfect_image,
    generate_square_alignment,
)
from utilities.nearestNDInterpolator import NearestNDInterpolator
from tqdm import tqdm
import nrrd
from scipy.ndimage import zoom

metadata = pd.read_csv("metadata/filtered_ISH_pixel_size.csv")
image_folder_path = "/mnt/g/AllenDataalignmentProj/resolutionPixelSizeMetadata/ISH/"
path_to_registration_files = "/mnt/g/Allen_Realignment_EBRAINS_dataset/"


def name_from_id(id, metadata):
    return metadata["animal_name"][metadata["experiment_id"] == id].values[0]


def pixel_size_from_id(id, metadata):
    return metadata["pixel_size"][metadata["experiment_id"] == id].values[0]


def id_to_data_path(experiment_id, data_base, metadata):
    name = name_from_id(experiment_id, metadata)
    return os.path.join(data_base, str(name), str(experiment_id))


def id_to_quint_path(experiment_id, data_base, metadata):
    name = name_from_id(experiment_id, metadata)
    return os.path.join(data_base, "QUINT_registration_jsons", str(name)) + ".json"


def id_to_quint_json(experiment_id, data_base, metadata):
    quint_path = id_to_quint_path(experiment_id, data_base, metadata)
    quint_json = load_quint_json(quint_path, propagate_missing_values=False)["slices"]
    quint_json = [
        i for i in quint_json if i["filename"].split("/")[0] == str(experiment_id)
    ]
    return quint_json


def load_warped_image(
    filename,
    image_folder_path,
    affine_folder_path,
    nonlinear_folder_path,
    target_resolution,
    mode,
    experiment_id,
    metadata,
):
    affine_path = os.path.join(affine_folder_path, filename + "_SyN_affineTransfo.mat")
    nonlinear_path = os.path.join(
        nonlinear_folder_path, filename + "_SyN_nonLinearDF.nii.gz"
    )

    affine_transform = read_ants_affine(affine_path)
    nonlinear_transform, nonlinear_height, nonlinear_width = read_nonlinear(
        nonlinear_path
    )
    if mode == "expression":
        image_path = os.path.join(image_folder_path, "expression", filename + ".jpg")
        pixel_size_um = pixel_size_from_id(experiment_id, metadata)
        transform_constant = 0
    elif mode == "histology":
        image_path = os.path.join(image_folder_path, "10um_new", filename + ".jpg")
        pixel_size_um = 10
        transform_constant = 255
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        return None
    target_scale = pixel_size_um / target_resolution
    target_height, target_width = image.shape
    target_height = np.round(target_height * target_scale).astype(int)
    target_width = np.round(target_width * target_scale).astype(int)
    pixel_size_um = target_resolution
    image = cv2.resize(
        image, (target_width, target_height), interpolation=cv2.INTER_AREA
    )
    if (affine_transform is None) or (nonlinear_transform is None):
        print(f"returning non warped image for {filename}")
        return image
    else:
        scale_factor = 25 / pixel_size_um
        affine_transform[[0, 1], [2, 2]] *= scale_factor
        nonlinear_height = int(nonlinear_height * scale_factor)
        nonlinear_width = int(nonlinear_width * scale_factor)
        nonlinear_transform = nonlinear_transform * scale_factor
        nonlinear_transform = cv2.resize(
            nonlinear_transform, (nonlinear_width, nonlinear_height)
        )
        affined_image = apply_affine_to_image(
            image,
            affine_transform,
            (nonlinear_height, nonlinear_width),
            mode="constant",
            transform_constant=transform_constant,
        )
        nonlineared_image = apply_nonlinear_to_image(
            affined_image,
            nonlinear_transform,
            mode="constant",
            transform_constant=transform_constant,
        )
        return nonlineared_image


def value_to_rgb(value, vmin, vmax, cmap_name="viridis"):
    # Normalize value between 0 and 1
    normalized = (value - vmin) / (vmax - vmin)
    normalized = np.clip(normalized, 0, 1)
    # Get color from the specified colormap
    cmap = plt.get_cmap(cmap_name)
    rgba = cmap(normalized)
    rgba = np.array(rgba) * 255
    rgba = np.round(rgba).astype(int)
    return rgba[:3].tolist()


def section_index_to_atlas(
    section_dict,
    resolution,
    cutoff,
    mode,
    image_folder_path,
    affine_folder_path,
    nonlinear_folder_path,
):
    filename = os.path.splitext(os.path.basename(section_dict["filename"]))[0]
    warped_image = load_warped_image(
        filename,
        image_folder_path,
        affine_folder_path,
        nonlinear_folder_path,
        resolution,
        mode,
    )
    if warped_image is None:
        return None, None
    atlas_points = image_to_atlas_space(warped_image, section_dict["anchoring"])
    warped_image = warped_image.flatten()
    mask = warped_image > cutoff
    warped_image = warped_image[mask]
    atlas_points = atlas_points[mask]
    return warped_image, atlas_points


def write_values_to_meshview(values, atlas_points, filename, cmap="plasma"):
    unique_values = np.unique(values)
    rgb_vals = np.array([value_to_rgb(i, 0, 255, cmap) for i in unique_values])
    info_file = pd.DataFrame(
        {
            "idx": unique_values.tolist(),
            "name": unique_values.tolist(),
            "r": rgb_vals[:, 0],
            "g": rgb_vals[:, 1],
            "b": rgb_vals[:, 2],
        }
    )
    write_points_to_meshview(atlas_points, values, filename, info_file)


def id_to_points(
    experiment_id,
    image_folder_path,
    path_to_registration_files,
    resolution=10,
    cutoff=0,
    mode="expression",
):
    affine_root = os.path.join(path_to_registration_files, "affine_registration_files")
    nonlinear_root = os.path.join(
        path_to_registration_files, "nonlinear_registration_files"
    )
    quint_json = id_to_quint_json(experiment_id, path_to_registration_files, metadata)
    image_folder_path = id_to_data_path(experiment_id, image_folder_path, metadata)
    affine_folder_path = id_to_data_path(experiment_id, affine_root, metadata)
    nonlinear_folder_path = id_to_data_path(experiment_id, nonlinear_root, metadata)
    images = []
    atlas_points_list = []
    for section_dict in quint_json:
        image, atlas_points = section_index_to_atlas(
            section_dict,
            resolution,
            cutoff,
            mode,
            image_folder_path,
            affine_folder_path,
            nonlinear_folder_path,
        )
        if image is None:
            continue
        images.append(image)
        atlas_points_list.append(atlas_points)
    images = np.concatenate(images).flatten()
    atlas_points_list = np.concatenate(atlas_points_list)
    return images, atlas_points_list


def gene_to_points(
    gene,
    path_to_images,
    path_to_registration_files,
    cutoff=0,
    mode="expression",
    resolution=10,
):
    id_matches = metadata[
        (metadata["gene"].str.lower() == gene.lower())
    ].experiment_id.values
    images_list, atlas_points_list = [], []
    for id_match in tqdm(id_matches):
        images, atlas_points = id_to_points(
            id_match,
            path_to_images,
            path_to_registration_files,
            cutoff=cutoff,
            mode=mode,
            resolution=resolution,
        )
        images_list.append(images)
        atlas_points_list.append(atlas_points)

    images_list = np.concatenate(images_list).flatten()
    atlas_points_list = np.concatenate(atlas_points_list)
    return images_list, atlas_points_list


def id_to_volume(
    experiment_id,
    image_folder_path,
    path_to_registration_files,
    resolution=10,
    mode="expression",
    return_frequencies=False,
    missing_data_fill_value=np.nan,
):
    affine_root = os.path.join(path_to_registration_files, "affine_registration_files")
    nonlinear_root = os.path.join(
        path_to_registration_files, "nonlinear_registration_files"
    )
    quint_json = id_to_quint_json(experiment_id, path_to_registration_files, metadata)
    image_folder_path = id_to_data_path(experiment_id, image_folder_path, metadata)
    affine_folder_path = id_to_data_path(experiment_id, affine_root, metadata)
    nonlinear_folder_path = id_to_data_path(experiment_id, nonlinear_root, metadata)
    scale_factor = 25 / resolution
    atlas_shape = (np.array([11400, 14150, 8000]) / resolution).astype(int)
    gene_volume = np.zeros(atlas_shape)
    fill_volume = np.zeros(atlas_shape)
    for section_dict in quint_json:
        filename = os.path.splitext(os.path.basename(section_dict["filename"]))[0]
        anchoring = np.array(section_dict["anchoring"]) * scale_factor
        warped_image = load_warped_image(
            filename,
            image_folder_path,
            affine_folder_path,
            nonlinear_folder_path,
            resolution,
            mode,
            experiment_id,
            metadata,
        )
        if warped_image is None:
            continue
        image_perfect, _ = perfect_image(warped_image, anchoring, resolution)
        image_perfect = cv2.resize(
            image_perfect,
            (atlas_shape[0], atlas_shape[2]),
            interpolation=cv2.INTER_AREA,
        )
        square_alignment = generate_square_alignment(anchoring, atlas_shape, resolution)
        volume_coordinates = generate_target_coordinates(square_alignment, atlas_shape)
        gene_volume[volume_coordinates] += image_perfect.flatten()
        fill_volume[volume_coordinates] += 1
    if missing_data_fill_value != 0:
        gene_volume[fill_volume == 0] = missing_data_fill_value
    if return_frequencies:
        return gene_volume, fill_volume
    else:
        return gene_volume


def gene_to_volume(
    gene,
    path_to_images,
    path_to_registration_files,
    mode="expression",
    resolution=10,
    return_frequencies=False,
    missing_data_fill_value=np.nan,
):
    id_matches = metadata[
        (metadata["gene"].str.lower() == gene.lower())
    ].experiment_id.values
    atlas_shape = (np.array([11400, 14150, 8000]) / resolution).astype(int)
    gene_volume = np.zeros(atlas_shape)
    frequencies = np.zeros(atlas_shape)
    for id_match in tqdm(id_matches):
        id_volume, id_frequency = id_to_volume(
            id_match,
            path_to_images,
            path_to_registration_files,
            mode=mode,
            resolution=resolution,
            return_frequencies=True,
            missing_data_fill_value=0,
        )
        gene_volume += id_volume
        frequencies += id_frequency
    mask = frequencies != 0
    gene_volume[mask] = gene_volume[mask] / frequencies[mask]
    if missing_data_fill_value != 0:
        gene_volume[frequencies == 0] = missing_data_fill_value
    if return_frequencies:
        return gene_volume, frequencies
    else:
        return gene_volume


def interpolate(gene_volume, frequency_volume, k, atlas):
    output_volume = gene_volume.copy()
    atlas_shape = np.array(atlas.shape)
    target_shape = atlas_shape * (10 / resolution)
    scale_factors = np.array(target_shape) / np.array(atlas_shape)
    atlas = zoom(atlas, scale_factors, order=1)
    brain_mask = atlas != 0
    valid_vol = frequency_volume != 0
    indices_to_fit = brain_mask & valid_vol
    indices_to_fill = brain_mask & ~valid_vol
    grid = np.mgrid[0 : target_shape[0], 0 : target_shape[1], 0 : target_shape[2]]
    points = grid.reshape((3, -1)).T
    interpolator = NearestNDInterpolator(
        points[indices_to_fit.flatten()], gene_volume[indices_to_fit]
    )
    output_volume[indices_to_fill] = interpolator(
        points[indices_to_fill.flatten()], k=k
    )
    # we can now perform the interpolation on the values on the section
    # This is done so as to make the volume appear homogenous and remove streaking.
    interpolator = NearestNDInterpolator(
        points[indices_to_fill.flatten()], output_volume[indices_to_fill]
    )
    output_volume[indices_to_fit] = interpolator(points[indices_to_fit.flatten()], k=k)
    return output_volume


# def interpolate_nan(volume, method="distance"):


cutoff = 0
mode = "expression"
resolution = 25

# images_list, atlas_points_list = gene_to_points(gene, path_to_images, path_to_registration_files, cutoff=cutoff, mode=mode, resolution=resolution)
# write_values_to_meshview(images_list, atlas_points_list, f"{gene}_{mode}_cutoff_{cutoff}.json", cmap='gray')

import concurrent.futures
from tqdm import tqdm
import nibabel as nib
import nrrd
import numpy as np

ccfv3aAtlas, header = nrrd.read("ccfv3a.nrrd")


def process_gene(
    gene, resolution, metadata, image_folder_path, path_to_registration_files
):
    ids = metadata[metadata["gene"].str.lower() == gene.lower()]["experiment_id"]
    output_volume = np.zeros(
        (np.array(ccfv3aAtlas.shape) / (resolution / 10)).astype(int)
    )
    successful = 0
    for id in ids:
        gene_volume, frequency_volume = id_to_volume(
            id,
            image_folder_path,
            path_to_registration_files,
            resolution=resolution,
            mode="expression",
            return_frequencies=True,
            missing_data_fill_value=0,
        )
        gene_volume = interpolate(gene_volume, frequency_volume, k=5, atlas=ccfv3aAtlas)
        output_volume += gene_volume
        successful += 1
    if successful == 0:
        return
    output_volume /= max(len(ids), 1)
    output_volume = output_volume.astype(np.uint8)
    affine = np.eye(4)
    affine[:3, :3] *= resolution
    dims = output_volume.shape
    affine[:3, 3] = -0.5 * np.array(dims) * resolution
    z_offset = 700
    affine[1, 3] = -7300
    # affine[1,3] -= z_offset
    img = nib.Nifti1Image(output_volume, affine)
    img.set_qform(affine, code=1)
    img.header["xyzt_units"] = 3
    nib.save(img, f"output/{gene}_interp_{resolution}um.nii.gz")


# process_gene("psg16", resolution, metadata, image_folder_path, path_to_registration_files)

# img = nib.load("output/psg16_interp_25um.nii.gz")
# dict(img.header)
start = 0
# Use a ThreadPoolExecutor to parallelize gene processing
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
    list(
        tqdm(
            executor.map(
                lambda g: process_gene(
                    g,
                    resolution,
                    metadata,
                    image_folder_path,
                    path_to_registration_files,
                ),
                metadata["gene"].unique()[start:],
            ),
            total=len(metadata["gene"].unique()[start:]),
        )
    )
