# RoomServiceApi

All URIs are relative to *http://localhost*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**roomServiceCreateRoom**](#roomservicecreateroom) | **POST** /api/v1/room/create | |
|[**roomServiceDeleteRoom**](#roomservicedeleteroom) | **DELETE** /api/v1/room/delete/{roomId} | |
|[**roomServiceGetRoom**](#roomservicegetroom) | **GET** /api/v1/room/{roomId} | 投稿操作|

# **roomServiceCreateRoom**
> V1StandardResponse roomServiceCreateRoom(body)


### Example

```typescript
import {
    RoomServiceApi,
    Configuration,
    V1CreateRoomRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new RoomServiceApi(configuration);

let body: V1CreateRoomRequest; //

const { status, data } = await apiInstance.roomServiceCreateRoom(
    body
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **body** | **V1CreateRoomRequest**|  | |


### Return type

**V1StandardResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | A successful response. |  -  |
|**0** | An unexpected error response. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **roomServiceDeleteRoom**
> V1StandardResponse roomServiceDeleteRoom()


### Example

```typescript
import {
    RoomServiceApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new RoomServiceApi(configuration);

let roomId: string; // (default to undefined)

const { status, data } = await apiInstance.roomServiceDeleteRoom(
    roomId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **roomId** | [**string**] |  | defaults to undefined|


### Return type

**V1StandardResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | A successful response. |  -  |
|**0** | An unexpected error response. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **roomServiceGetRoom**
> V1GetRoomResponse roomServiceGetRoom()


### Example

```typescript
import {
    RoomServiceApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new RoomServiceApi(configuration);

let roomId: string; // (default to undefined)

const { status, data } = await apiInstance.roomServiceGetRoom(
    roomId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **roomId** | [**string**] |  | defaults to undefined|


### Return type

**V1GetRoomResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | A successful response. |  -  |
|**0** | An unexpected error response. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

