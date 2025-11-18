# RoomServiceApi

All URIs are relative to *http://localhost*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**roomServiceCreateRoom**](#roomservicecreateroom) | **POST** /api/v1/room/create | ルーム作成|
|[**roomServiceDeleteRoom**](#roomservicedeleteroom) | **DELETE** /api/v1/room/delete/{roomId} | ルーム削除|
|[**roomServiceGetRoom**](#roomservicegetroom) | **GET** /api/v1/room/{roomId} | ルーム取得|
|[**roomServiceHealthCheck**](#roomservicehealthcheck) | **GET** /api/v1/healthz | ヘルスチェック|
|[**roomServiceJoinRoom**](#roomservicejoinroom) | **POST** /api/v1/room/{roomId}/join | ルームに参加|
|[**roomServiceLeaveRoom**](#roomserviceleaveroom) | **POST** /api/v1/room/{roomId}/leave | ルームから退出|
|[**roomServiceTouchRoom**](#roomservicetouchroom) | **POST** /api/v1/room/{roomId}/touch | ルームをタッチ（TTL更新）|

# **roomServiceCreateRoom**
> V1CreateRoomResponse roomServiceCreateRoom(body)


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

**V1CreateRoomResponse**

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
let userId: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.roomServiceDeleteRoom(
    roomId,
    userId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **roomId** | [**string**] |  | defaults to undefined|
| **userId** | [**string**] |  | (optional) defaults to undefined|


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

# **roomServiceHealthCheck**
> V1HealthCheckResponse roomServiceHealthCheck()


### Example

```typescript
import {
    RoomServiceApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new RoomServiceApi(configuration);

const { status, data } = await apiInstance.roomServiceHealthCheck();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**V1HealthCheckResponse**

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

# **roomServiceJoinRoom**
> V1StandardResponse roomServiceJoinRoom(body)


### Example

```typescript
import {
    RoomServiceApi,
    Configuration,
    RoomServiceJoinRoomBody
} from './api';

const configuration = new Configuration();
const apiInstance = new RoomServiceApi(configuration);

let roomId: string; // (default to undefined)
let body: RoomServiceJoinRoomBody; //

const { status, data } = await apiInstance.roomServiceJoinRoom(
    roomId,
    body
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **body** | **RoomServiceJoinRoomBody**|  | |
| **roomId** | [**string**] |  | defaults to undefined|


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

# **roomServiceLeaveRoom**
> V1StandardResponse roomServiceLeaveRoom(body)


### Example

```typescript
import {
    RoomServiceApi,
    Configuration,
    RoomServiceLeaveRoomBody
} from './api';

const configuration = new Configuration();
const apiInstance = new RoomServiceApi(configuration);

let roomId: string; // (default to undefined)
let body: RoomServiceLeaveRoomBody; //

const { status, data } = await apiInstance.roomServiceLeaveRoom(
    roomId,
    body
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **body** | **RoomServiceLeaveRoomBody**|  | |
| **roomId** | [**string**] |  | defaults to undefined|


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

# **roomServiceTouchRoom**
> V1StandardResponse roomServiceTouchRoom()


### Example

```typescript
import {
    RoomServiceApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new RoomServiceApi(configuration);

let roomId: string; // (default to undefined)

const { status, data } = await apiInstance.roomServiceTouchRoom(
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

